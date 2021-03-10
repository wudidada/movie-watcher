const chokidar = require("chokidar");
const fs = require("fs");
const axios = require("axios");

const recFile = "files.rec";
const watchFiles = require("./filelist.js");
const log = console.log.bind(console);
const files = JSON.parse(fs.readFileSync(recFile)) || {};
const newFiles = [];
const path = require("path");

const server = axios.create({
  baseURL: "http://192.168.1.106:8888/api",
});

server.interceptors.request.use((config) => {
  const token =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiYWEiLCJpYXQiOjE2MTQ4NjEyMzF9.bEPmh8-2WDP3Epvo0X0fzXt5fQhjmG5mnDRFq4SPQNU";
  if (token) {
    config.headers["Authorization"] = "Bearer " + token;
  }
  return config;
});

function setOwned(owned) {
  return server.put("/user/owned", owned);
}

function getCid(dvd_id) {
  return server.get("/jav/dvd_to_cid", { params: { dvd_id } });
}

function addOwned(cid) {
  return server.put("/user/add_owned", {
    cid,
    data: { date: new Date() },
  });
}

function delOwned(cid) {
  return server.put("/user/del_owned", {
    cid,
  });
}

const watcher = chokidar.watch(watchFiles, {
  persistent: true,
});

// Add event listeners.
watcher
  .on("add", add)
  .on("change", add)
  .on("unlink", del)
  .on("ready", () => log("ready."))
  .on("error", (error) => log(`Watcher error: ${error}`));

function ready() {
  for (const file of newFiles) {
    if (!file in files) {
      delete files[file];
    }
  }
  const cids = Object.values(files).filter((v) => v != null);
  const owned = {};
  const date = new Date();
  for (const cid of cids) {
    owned[cid] = { date };
  }
  log("start set");
  setOwned(owned)
    .then(() => {
      fs.writeFileSync(recFile, JSON.stringify(files));
      isStarting = false;
      log("init success.");
    })
    .catch((err) => log("init failed:", err.message));
}

function del(file) {
  let fileName = cleanFile(file);
  log(`del File ${file}`);
  const cid = files[fileName];
  if (!cid) {
    log(`delete: ${fileName} -> ${files[fileName]} [${file}]`);
  }
  delOwned(cid)
    .then(() => {
      delete files[fileName];
      fs.writeFileSync(recFile, JSON.stringify(files));
      log(`delete: ${fileName} -> ${files[fileName]} [${file}]`);
    })
    .catch((err) => {
      log(`del failed: ${fileName} -> ${files[fileName]} [${file}]`);
      log(err.message);
    });
}

async function add(file) {
  //   log(`File ${file} has been added`);
  let fileName = cleanFile(file);
  log(`filename: ${fileName} [${file}]`);

  if (fileName in files) {
    log(`processed before: ${fileName} -> ${files[fileName]} [${file}]`);
    return;
  }

  let cid = fileName[fileName];
  if (!cid) {
    const response = await getCid(fileName);
    if (response.data.length == 0) {
      files[fileName] = null;
      log(`get cid faild: ${fileName} [${file}]`);
    } else if (response.data.length > 1) {
      log(
        `mal cid: ${fileName} -> ${response.data.map(
          (value) => value.cid
        )} [${file}]`
      );
      files[fileName] = cid;
    } else {
      cid = response.data[0].cid;
      files[fileName] = cid;
      log(`success: ${fileName} -> ${cid} [${file}]`);
    }

    if (cid) {
      addOwned(cid);
    }
  }

  fs.writeFileSync(recFile, JSON.stringify(files));
}

function cleanFile(file) {
  let fileName = path.basename(file, path.extname(file));
  const fileSplit = fileName.split("_");
  if (fileSplit && +fileSplit[fileSplit.length - 1]) {
    fileName = fileSplit.slice(0, -1).join("_");
  }
  return fileName;
}
