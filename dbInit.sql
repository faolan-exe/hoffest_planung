SET check_function_bodies = false
;

CREATE TABLE genehmigungen(
  id serial NOT NULL,
  admin_id integer NOT NULL,
  genehmigt boolean NOT NULL,
  kommentar text NOT NULL,
  CONSTRAINT genehmigungen_pkey PRIMARY KEY(id)
);

CREATE TABLE staende(
  stand_id integer NOT NULL,
  genehmigungs_prozess integer NOT NULL,
  CONSTRAINT staende_pkey PRIMARY KEY(
    stand_id,
    genehmigungs_prozess
  )
);

CREATE TABLE stand(
  id serial NOT NULL,
  auth_id text NOT NULL,
  ort integer NOT NULL,
  ort_spezifikation text NOT NULL,
  lehrer text NOT NULL,
  klasse text NOT NULL,
  beschreibung integer NOT NULL,
  braucht_strom boolean NOT NULL,
  CONSTRAINT stand_pkey PRIMARY KEY(id),
  CONSTRAINT stand_auth_id_key UNIQUE(auth_id)
);

CREATE TABLE "admin"(
  id serial NOT NULL,
  "name" text NOT NULL,
  email text NOT NULL,
  "password" text NOT NULL,
  CONSTRAINT admin_pkey PRIMARY KEY(id),
  CONSTRAINT admin_name_key UNIQUE("name"),
  CONSTRAINT admin_email_key UNIQUE(email)
);

CREATE TABLE "trusted_ids"(
  id serial PRIMARY KEY,
  trusted text NOT NULL
);

ALTER TABLE staende
  ADD CONSTRAINT staende_genehmigungs_prozess_fkey
    FOREIGN KEY (genehmigungs_prozess) REFERENCES genehmigungen (id);

ALTER TABLE staende
  ADD CONSTRAINT staende_stand_id_fkey
    FOREIGN KEY (stand_id) REFERENCES stand (id);

ALTER TABLE genehmigungen
  ADD CONSTRAINT genehmigungen_admin_id_fkey
    FOREIGN KEY (admin_id) REFERENCES "admin" (id);
