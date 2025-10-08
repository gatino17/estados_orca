#!/usr/bin/env bash
export $(grep -v '^#' .env | xargs)
uvicorn app.main:app --host ${API_HOST:-0.0.0.0} --port ${API_PORT:-8000} --reload