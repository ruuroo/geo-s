import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const payload = JSON.parse(fs.readFileSync(path.join(root, "public/data/countries.json"), "utf8"));
const countries = payload.countries;
const errors = [];
const seen2 = new Set();
const seen3 = new Set();

for (const country of countries) {
  if (seen2.has(country.cca2)) errors.push(`Duplikat alpha-2: ${country.cca2}`);
  if (seen3.has(country.cca3)) errors.push(`Duplikat alpha-3: ${country.cca3}`);
  seen2.add(country.cca2);
  seen3.add(country.cca3);
  if (!country.norwegianName) errors.push(`${country.cca2}: mangler norsk navn`);
  if (!country.capitals?.length) errors.push(`${country.cca2}: mangler hovedstad`);
  if (!country.aliases?.length) errors.push(`${country.cca2}: mangler aliaser`);
  if (!country.capitalAliases?.length) errors.push(`${country.cca2}: mangler hovedstadsaliaser`);
  if (country.independent && !country.continents?.length) errors.push(`${country.cca2}: selvstendig stat uten verdensdel`);
  const flag = path.join(root, "public", country.flagPath.replace(/^\//, ""));
  if (!fs.existsSync(flag) || fs.statSync(flag).size < 100) errors.push(`${country.cca2}: flaggfil mangler eller er tom`);
}
const independent = countries.filter((country) => country.independent).length;
if (independent !== 195) errors.push(`Forventet 195 selvstendige stater, fant ${independent}`);
if (countries.length < 195) errors.push(`For få spillbare land: ${countries.length}`);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Datavalidering OK: ${countries.length} land/territorier, ${independent} selvstendige stater og ${countries.length} lokale flagg.`);
