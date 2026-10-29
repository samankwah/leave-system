import type { Metadata } from "next";
import { todayIso } from "@/server/db";
import { getDb } from "@/server/instance";
import { listNotifications } from "@/server/repos/notifications";
import { requireUser } from "@/server/session";
import NotificationList from "./NotificationList";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  return <NotificationList items={await listNotifications(await getDb(), user.id, 200)} today={todayIso()} />;
}
