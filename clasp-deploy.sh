#!/usr/bin/env bash

if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
  if "$BASH" "${BASH_SOURCE[0]}" "$@"; then
    return 0
  else
    return $?
  fi
fi

set -euo pipefail

if [[ $# -ne 2 ]]; then
  printf 'Usage: bash %s "version name" <devel|prod>\n' "$0" >&2
  if [[ $# -eq 0 ]]; then
    exit 0
  fi
  exit 1
fi

version_name="$1"
deployment_type="$2"

if [[ ! "$version_name" =~ [^[:space:]] ]]; then
  printf 'Version name must not be empty.\n' >&2
  exit 1
fi

case "$deployment_type" in
  devel)
    config_name='DEV_CONFIG'
    deployment_id='AKfycbzp-_nGkDu3xA-dHjkv012q28J8ea5DW6yHWk8mfuq_wRDrgc5iycYIruz7OnSwg7sF'
    deployment_description='Development deployment'
    ;;
  prod)
    config_name='PROD_CONFIG'
    deployment_id='AKfycby0Q9WvoxzQDMvtwOP87L_CYXA7eAzXcx4XpOF6eK3N51ld31RIvdLd0ioKqfAB9iJC'
    deployment_description='Production deployment'
    ;;
  *)
    printf 'Deployment type must be devel or prod.\n' >&2
    exit 1
    ;;
esac

if [[ ! "$deployment_id" =~ [^[:space:]] ]]; then
  printf 'Set APPS_SCRIPT_PROD_DEPLOYMENT_ID to the production deployment ID. Nothing was pushed.\n' >&2
  exit 1
fi

version_name="[$deployment_type] $version_name"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir/apps-script"

auth_status="$(clasp show-authorized-user --json)"
if auth_email="$(printf '%s' "$auth_status" | node -e '
  const { readFileSync } = require("node:fs");
  let auth;
  try { auth = JSON.parse(readFileSync(0, "utf8")); }
  catch { process.exit(2); }
  if (auth.loggedIn !== true || typeof auth.email !== "string" || !auth.email) process.exit(1);
  process.stdout.write(auth.email);
')"; then
  printf 'Using existing clasp login: %s\n' "$auth_email"
else
  auth_result=$?
  if [[ "$auth_result" -ne 1 ]]; then
    printf 'Could not read the clasp authentication status. Nothing was pushed.\n' >&2
    exit 1
  fi
  clasp login
fi

source_file="$PWD/apps-script/Kód.js"
source_backup="$(mktemp)"
restore_source() {
  local status=$?
  if ! cp -- "$source_backup" "$source_file"; then
    printf 'Could not restore the local source. Backup: %s\n' "$source_backup" >&2
    return 1
  fi
  rm -f -- "$source_backup"
  return "$status"
}
if ! cp -- "$source_file" "$source_backup"; then
  rm -f -- "$source_backup"
  exit 1
fi
trap restore_source EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

node --input-type=module - "$source_file" "$config_name" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';

const [sourceFile, configName] = process.argv.slice(2);
const source = readFileSync(sourceFile, 'utf8');
const assignment = /^([\t ]*const[\t ]+CONFIG[\t ]*=[\t ]*)(?:PROD_CONFIG|DEV_CONFIG)([\t ]*;[\t ]*)(\r?)$/gm;
if ([...source.matchAll(assignment)].length !== 1) {
  throw new Error('Expected exactly one CONFIG assignment to PROD_CONFIG or DEV_CONFIG. Nothing was pushed.');
}
writeFileSync(sourceFile, source.replace(assignment, (_, prefix, suffix, cr) => `${prefix}${configName}${suffix}${cr}`));
NODE

printf 'Deploying %s with %s as "%s"\n' "$deployment_type" "$config_name" "$version_name"
clasp push
version_output="$(clasp create-version "$version_name" --json)"

if [[ "$version_output" =~ \"versionNumber\"[[:space:]]*:[[:space:]]*([1-9][0-9]*) ]]; then
  version="${BASH_REMATCH[1]}"
else
  printf 'Could not read the created version number: %s\n' "$version_output" >&2
  exit 1
fi

clasp create-deployment -V "$version" -d "$deployment_description" -i "$deployment_id"
