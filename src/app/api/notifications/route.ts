import { route } from "@/server/api";
import { listNotifications } from "@/server/repos/notifications";

export const GET = route(null, ({ db, user }) => listNotifications(db, user.id, 20));
