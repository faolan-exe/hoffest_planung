# syntax=docker/dockerfile:1

FROM python:3.12.1-slim

WORKDIR /python-docker

COPY requirements.txt requirements.txt
RUN pip3 install -r requirements.txt
RUN pip install gunicorn
COPY . .

CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:8000", "main:app"]