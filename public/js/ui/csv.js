/** Export a room's ticket history as CSV (opens in Excel / Sheets). */

// Cells starting with = + - @ would run as formulas in a spreadsheet (CSV injection): prefix them.
function cell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportHistoryCsv(state, roomCode) {
  const header = ["Ticket", "Scale", "Final", "Votes", "Saved at"];
  const rows = [...state.history].reverse().map((r) => [
    r.topic,
    state.decks[r.deck]?.label || r.deck,
    r.final ?? "",
    Object.entries(r.votes).map(([name, vote]) => `${name}: ${vote}`).join("; "),
    new Date(r.at).toISOString(),
  ]);
  const csv = "﻿" + [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `estimo-${roomCode}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
