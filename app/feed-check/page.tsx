import { redirect } from "next/navigation";

export default function FeedCheckRedirect() {
  redirect("/import-tasks");
}
