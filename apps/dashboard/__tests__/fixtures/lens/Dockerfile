FROM python:3.12-bookworm
ENV CI=true
ENV DATABASE_URL=postgresql://lens:lens@db:5432/lens
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
ENV PIP_ROOT_USER_ACTION=ignore
ENV PYTHONDONTWRITEBYTECODE=1
ENV POETRY_VIRTUALENVS_CREATE=false
ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV UV_LINK_MODE=copy
WORKDIR /app
COPY repo.bundle /tmp/repo.bundle
RUN git clone -q -b hecate-snapshot /tmp/repo.bundle /app && rm /tmp/repo.bundle && git -C /app checkout -q 76105569899d8e6ca98245fae8801dd81b878f8e && git -C /app branch -D hecate-snapshot
RUN cd /app && rm -rf .git && git init -q && git -c user.name=hecate -c user.email=hecate@localhost add -A && git -c user.name=hecate -c user.email=hecate@localhost commit -qm base
RUN cd /app && pip install -r backend/requirements.txt
RUN cd /app && pip install pytest
