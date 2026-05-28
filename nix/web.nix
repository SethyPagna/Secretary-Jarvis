# nix/web.nix — Jarvis Web Dashboard (Vite/React) frontend build
{ pkgs, jarvisNpmLib, ... }:
let
  src = ../web;
  npmDeps = pkgs.fetchNpmDeps {
    inherit src;
    hash = "sha256-6qhGuifHVtCeep1SiQdCUxBMr7UGhYpdMTvXhrQu/zA=";
  };

  npm = jarvisNpmLib.mkNpmPassthru { folder = "web"; attr = "web"; pname = "jarvis-web"; };

  packageJson = builtins.fromJSON (builtins.readFile (src + "/package.json"));
  version = packageJson.version;
in
pkgs.buildNpmPackage (npm // {
  pname = "jarvis-web";
  inherit src npmDeps version;

  doCheck = false;

  buildPhase = ''
    npx tsc -b
    npx vite build --outDir dist
  '';

  installPhase = ''
    runHook preInstall
    cp -r dist $out
    runHook postInstall
  '';
})
