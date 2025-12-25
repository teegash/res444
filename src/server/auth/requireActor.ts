import "server-only";

export function requireActorUserId(req: Request) {
  const actor = req.headers.get("x-actor-user-id");
  if (!actor) throw new Error("Missing x-actor-user-id");
  return actor;
}

