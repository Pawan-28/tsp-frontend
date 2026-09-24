import { createQueryClient } from "./lib/queryClient.js";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen.js";

export const getRouter = () => {
  const queryClient = createQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
