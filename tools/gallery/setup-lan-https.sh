#!/usr/bin/env bash
set -euo pipefail
umask 077
instance=${1:?Node-RED-Benutzerordner angeben}
shift
(( $# )) || { echo "IPv4-Adresse(n) für das Handy angeben"; exit 1; }
dir="$instance/gallery-https"
mkdir -p "$dir"
cd "$dir"
san=""
for addr in "$@"; do
  python3 -c 'import ipaddress,sys; ipaddress.IPv4Address(sys.argv[1])' "$addr"
  san="${san:+$san,}IP:$addr"
done
if [[ ! -e ca.pem ]]; then
 openssl req -new -x509 -nodes -newkey rsa:3072 -days 3650 -sha256 -keyout ca.key -out ca.pem -subj '/CN=GEORGSHOME Handy lokale CA' -addext 'basicConstraints=critical,CA:TRUE,pathlen:0' -addext 'keyUsage=critical,keyCertSign,cRLSign' >/dev/null 2>&1
fi
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
openssl req -new -nodes -newkey rsa:2048 -keyout "$tmp/server.key" -out "$tmp/server.csr" -subj '/CN=GEORGSHOME Handy' >/dev/null 2>&1
printf '%s\n' "subjectAltName=$san" 'basicConstraints=critical,CA:FALSE' 'extendedKeyUsage=serverAuth' 'keyUsage=critical,digitalSignature,keyEncipherment' > "$tmp/extensions"
openssl x509 -req -in "$tmp/server.csr" -CA ca.pem -CAkey ca.key -CAcreateserial -out "$tmp/server.pem" -days 365 -sha256 -extfile "$tmp/extensions" 2>/dev/null
openssl verify -CAfile ca.pem "$tmp/server.pem"
mv "$tmp/server.key" server.key
mv "$tmp/server.pem" server.pem
printf '%s\n' "$@" > addresses
openssl x509 -in ca.pem -noout -fingerprint -sha256
