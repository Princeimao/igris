"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupIPC = setupIPC;
const electron_1 = require("electron");
const core_1 = require("@igris/core");
const dotenv_1 = __importDefault(require("dotenv"));
const node_path_1 = __importDefault(require("node:path"));
const electron_2 = require("electron");
// Load .env from workspace root or current directory
dotenv_1.default.config({ path: node_path_1.default.resolve(process.cwd(), '.env') });
dotenv_1.default.config({ path: node_path_1.default.resolve(process.cwd(), '../../.env') });
let igrisCore = null;
function setupIPC(mainWindow) {
    try {
        igrisCore = new core_1.IgrisCore();
    }
    catch (err) {
        console.error('[Main] Failed to initialize IgrisCore:', err);
    }
    electron_1.ipcMain.handle('igris:chat', async (_event, prompt, options) => {
        if (!igrisCore) {
            igrisCore = new core_1.IgrisCore();
        }
        return await igrisCore.chat(prompt, options);
    });
    electron_1.ipcMain.handle('igris:status', async () => {
        if (!igrisCore)
            return false;
        return await igrisCore.isHiveAvailable();
    });
    electron_1.ipcMain.handle('igris:memories', async (_event, type) => {
        if (!igrisCore)
            return [];
        const memories = igrisCore.memory.list(type);
        return memories.map(m => ({
            id: m.id,
            type: m.type,
            content: m.content,
            tags: m.tags,
            createdAt: m.createdAt.toISOString(),
        }));
    });
    electron_1.ipcMain.handle('igris:resize', async (_event, expanded) => {
        if (mainWindow.isDestroyed())
            return;
        if (expanded) {
            mainWindow.setSize(520, 360, true);
        }
        else {
            mainWindow.setSize(380, 56, true);
        }
    });
    electron_1.ipcMain.handle('igris:minimize', () => {
        mainWindow.minimize();
    });
    electron_1.ipcMain.handle('igris:close', () => {
        electron_2.app.quit();
    });
}
//# sourceMappingURL=ipc.js.map