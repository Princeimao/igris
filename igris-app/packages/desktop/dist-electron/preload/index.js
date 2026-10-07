"use strict";
const electron = require("electron");
const api = {
  chat: (prompt, options) => electron.ipcRenderer.invoke("igris:chat", prompt, options),
  checkHiveStatus: () => electron.ipcRenderer.invoke("igris:status"),
  getMemories: (type) => electron.ipcRenderer.invoke("igris:memories", type),
  resizeWindow: (expanded) => electron.ipcRenderer.invoke("igris:resize", expanded),
  minimizeWindow: () => electron.ipcRenderer.invoke("igris:minimize"),
  closeWindow: () => electron.ipcRenderer.invoke("igris:close"),
  setInteractionMode: (mode) => electron.ipcRenderer.invoke("igris:interaction-mode", mode),
  openExternal: (url) => electron.ipcRenderer.invoke("igris:open-external", url),
  mediaNowPlaying: () => electron.ipcRenderer.invoke("igris:media-now-playing"),
  mediaCommand: (command, positionSec) => electron.ipcRenderer.invoke("igris:media-command", command, positionSec),
  systemMuteGet: () => electron.ipcRenderer.invoke("igris:system-mute-get"),
  systemMuteToggle: () => electron.ipcRenderer.invoke("igris:system-mute-toggle"),
  onAutoCollapse: (cb) => {
    const listener = () => cb();
    electron.ipcRenderer.on("igris:auto-collapse", listener);
    return () => electron.ipcRenderer.removeListener("igris:auto-collapse", listener);
  },
  githubConnect: (token) => electron.ipcRenderer.invoke("igris:github-connect", token),
  githubProfile: () => electron.ipcRenderer.invoke("igris:github-profile"),
  githubDisconnect: () => electron.ipcRenderer.invoke("igris:github-disconnect")
};
electron.contextBridge.exposeInMainWorld("igris", api);
