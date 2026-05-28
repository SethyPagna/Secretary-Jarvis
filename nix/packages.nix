# nix/packages.nix — JARVIS package built with uv2nix
{ inputs, ... }:
{
  perSystem =
    { pkgs, inputs', ... }:
    let
      jarvisAgent = pkgs.callPackage ./jarvis-agent.nix {
        inherit (inputs) uv2nix pyproject-nix pyproject-build-systems;
        npm-lockfile-fix = inputs'.npm-lockfile-fix.packages.default;
        # Only embed clean revs — dirtyRev doesn't represent any upstream
        # commit, so comparing it would always claim "update available".
        rev = inputs.self.rev or null;
      };
    in
    {
      packages = {
        default = jarvisAgent;
        tui = jarvisAgent.jarvisTui;
        web = jarvisAgent.jarvisWeb;

        fix-lockfiles = jarvisAgent.jarvisNpmLib.mkFixLockfiles {
          packages = [ jarvisAgent.jarvisTui jarvisAgent.jarvisWeb ];
        };
      };
    };
}
