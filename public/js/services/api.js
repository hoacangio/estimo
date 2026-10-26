/**
 * REST calls to our Worker. The secret client id goes in a JSON body, never in the URL.
 * Both functions resolve to the parsed JSON, or null when offline / on a bad response.
 */
async function post(path, body) {
  try {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return await res.json();
  } catch {
    return null;
  }
}

/** Rooms hosted by this browser and the per-host limit: { ok, rooms: string[], max }. */
export const fetchHostedRooms = (clientId) => post("/api/host/rooms", { id: clientId });

/** Delete a room this browser hosts: { ok } or { ok: false, code: "forbidden" }. */
export const deleteRoom = (code, clientId) => post(`/api/rooms/${encodeURIComponent(code)}/delete`, { id: clientId });
