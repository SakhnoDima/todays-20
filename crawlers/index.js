import { amazonDataFetcher } from "./amazon.js";
import { cjDataFetcher } from "./cj.js";

export const CRAWLERS = {
  amazon: amazonDataFetcher,
  cj: cjDataFetcher,
};
