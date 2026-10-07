// Throwaway markup probe (deleted after use). Read-only: no clicks, no media.
const http = require("node:http");
const WebSocket = require("ws");
function list() {
  return new Promise((resolve, reject) => {
    http.get("http://127.0.0.1:9222/json/list", (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(JSON.parse(data)));
    }).on("error", reject);
  });
}
(async () => {
  const tabs = await list();
  const page = tabs.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.on("open", r));
  let id = 0;
  const pending = new Map();
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  const send = (method, params) => new Promise((resolve) => {
    const myId = ++id; pending.set(myId, resolve);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
  const evaluate = async (expression) => {
    const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return res.result?.result?.value;
  };
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 220, y: 18 });
  await new Promise((r) => setTimeout(r, 2000));
  const html = await evaluate(`(() => {
    const root = document.getElementById('root');
    if (!root) return 'NO-ROOT';
    const tags = [];
    root.querySelectorAll('*').forEach((el) => {
      const t = el.tagName.toLowerCase();
      if (['header', 'footer', 'main', 'nav', 'form', 'input', 'section'].includes(t)) tags.push(t);
    });
    return 'w=' + window.innerWidth + ' tags=' + tags.join(',');
  })()`);
  console.log("FORM-HTML:", html);
  ws.close();
  process.exit(0);
})().catch((e) => { console.error("PROBE-FAILED:", e.message); process.exit(1); });
