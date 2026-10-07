// Throwaway form-submit probe (deleted after use).
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
  const errors = [];
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.method === "Runtime.exceptionThrown") {
      errors.push(JSON.stringify(msg.params.exceptionDetails).slice(0, 300));
    }
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  const send = (method, params) => new Promise((resolve) => {
    const myId = ++id; pending.set(myId, resolve);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
  const evaluate = async (expression, awaitPromise = false) => {
    const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
    return res.result?.result?.value;
  };
  await send("Runtime.enable", {});
  // Open the dashboard first (synthetic notch hover).
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 220, y: 18 });
  await new Promise((r) => setTimeout(r, 1500));
  // Fill the footer input like a user would (native setter + input event),
  // then press Enter via the form's own submit.
  const filled = await evaluate(`(() => {
    const input = document.querySelector('footer input');
    if (!input) return 'NO-INPUT';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'hello igris test');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return 'FILLED:' + input.value;
  })()`);
  console.log("FILL:", filled);
  await new Promise((r) => setTimeout(r, 500));
  const clicked = await evaluate(`(() => {
    const form = document.querySelector('footer form');
    if (!form) return 'NO-FORM';
    if (typeof form.requestSubmit !== 'function') return 'NO-REQUESTSUBMIT';
    form.requestSubmit();
    return 'SUBMITTED';
  })()`);
  console.log("SUBMIT:", clicked);
  console.log("EXCEPTIONS:", errors.length ? errors : "none-so-far");
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    const state = await evaluate(`JSON.stringify({
      footer: (document.querySelector('footer')?.innerText || '').slice(0, 200),
      w: window.innerWidth, h: window.innerHeight
    })`).catch((e) => "EVAL-FAIL:" + e.message);
    console.log(`T+${(i + 1) * 10}s:`, state);
  }
  ws.close();
  process.exit(0);
})().catch((e) => { console.error("PROBE-FAILED:", e.message); process.exit(1); });
