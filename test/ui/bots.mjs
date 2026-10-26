// node bots.mjs <room> <count> [seconds]  — join N voters that each vote once
const [room, count, secs = 90] = process.argv.slice(2);
const names = ["An","Bình","Châu","Dũng","Em","Giang","Hạnh","Khoa","Linh","Minh","Nam","Oanh","Phúc","Quân","Sơn","Tâm","Uyên","Vy","Xuân","Yến","Long Nguyễn"];
const cards = ["1","2","3","5","8","3","5","5","2","8"];
for (let i = 0; i < Number(count); i++) {
  const ws = new WebSocket(`${(process.env.ESTIMO_URL || "http://localhost:8799").replace(/^http/, "ws")}/ws/${room}`);
  ws.onopen = () => { ws.send(JSON.stringify({ t: "join", id: crypto.randomUUID(), name: names[i % names.length], create: false }));
    setTimeout(() => ws.send(JSON.stringify({ t: "vote", v: cards[i % cards.length] })), 300 + i * 20); };
}
setTimeout(() => process.exit(0), Number(secs) * 1000);
