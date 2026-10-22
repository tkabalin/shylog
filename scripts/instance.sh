# Sourced by the other scripts with $instance set: checks the instance's env
# file and defines `compose`. Compose lets the shell's variables win over
# --env-file, so those the file sets are unset, lest one aim at another
# instance.
env_file=instances/$instance.env
[[ -f $env_file ]] || { echo "No $env_file" >&2; exit 1; }
unset_args=()
while IFS='=' read -r key _; do
  [[ $key =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] && unset_args+=(-u "$key")
done <"$env_file"
compose() { env "${unset_args[@]}" docker compose --env-file "$env_file" "$@"; }
