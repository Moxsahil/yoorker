import "./globals.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";

import { THEME } from "@/config/theme";
import { bootCustomizer } from "@/kit/customizer/customizer-script";

import { router } from "./router";

// The saved theme preset is applied before anything is drawn.
bootCustomizer(THEME);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
