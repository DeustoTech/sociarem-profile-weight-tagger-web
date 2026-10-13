#!/usr/bin/env bash
# Construye la imagen y la sube a Docker Hub usando docker/.env
set -euo pipefail

cd "$(dirname "$0")/.."

set -a
# shellcheck disable=SC1091
source docker/.env
set +a

: "${IMAGE_NAME:?}" "${IMAGE_TAG:?}" "${REGISTRY_NS:?}" "${DOCKER_USERNAME:?}"
PASS_VALUE="${DOCKER_PASSWORD:-${DOCKER_PASS:-${DOCKER_TOKEN:-}}}"
: "${PASS_VALUE:?Falta la contraseña/token de Docker Hub en .env}"

IMAGE="${REGISTRY_NS}/${IMAGE_NAME}"

echo ">> Login en Docker Hub como ${DOCKER_USERNAME}"
echo "$PASS_VALUE" | docker login -u "$DOCKER_USERNAME" --password-stdin

echo ">> Build ${IMAGE}:${IMAGE_TAG}"
docker compose --env-file docker/.env build

docker tag "${IMAGE}:${IMAGE_TAG}" "${IMAGE}:latest"

echo ">> Push"
docker push "${IMAGE}:${IMAGE_TAG}"
docker push "${IMAGE}:latest"

echo ">> Publicada: ${IMAGE}:${IMAGE_TAG} (y :latest)"
