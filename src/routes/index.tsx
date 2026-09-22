import { createFileRoute } from "@tanstack/react-router";
import { Klangpads } from "@/components/klangpads/Klangpads";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <Klangpads />;
}
