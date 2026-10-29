import { route } from "@/server/api";
import { listNotifications } from "@/server/repos/notifications";

export const GET = route(null, async ({ db, user }) => await listNotifications(db, user.id, 20));
