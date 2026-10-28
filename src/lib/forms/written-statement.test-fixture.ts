import type { FormValues } from "./types";

export const TEST_SIGNATURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=";
export function statementSignatures(second = true): FormValues {
  const values: FormValues = { status: "In Review", second_occupier: second ? "Yes" : "No" };
  for (const who of ["occupier_one", ...(second ? ["occupier_two"] : []), "director", "witness", "occupier_one_witness", ...(second ? ["occupier_two_witness"] : [])]) {
    values[`${who}_signature`] = TEST_SIGNATURE;
    values[`${who}_name`] = `Test ${who}`;
    values[`${who}_date`] = "2026-10-28";
    if (who.includes("witness")) values[`${who}_address`] = `Test address ${who}`;
  }
  return values;
}