import knexLib from "knex";
import knexConfig from "./knexfile.js";

export const db = knexLib(knexConfig);
