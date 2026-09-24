import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import App from "../App.jsx";

export const Route = createFileRoute("/$")({
  ssr: false,
  component: ClientApp,
});

function ClientApp() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;
  return <App />;
}
