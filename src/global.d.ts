import type { ApiBridge } from "./preload/index";

declare global {
  interface Window {
    api: ApiBridge;
  }
}
export {};
