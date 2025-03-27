SET check_function_bodies = false
;

CREATE TABLE public."admin"(
  id serial NOT NULL,
  "name" text NOT NULL,
  email text NOT NULL,
  "password" text NOT NULL,
  CONSTRAINT admin_pkey PRIMARY KEY(id),
  CONSTRAINT admin_email_key UNIQUE(email),
  CONSTRAINT admin_name_key UNIQUE("name")
);

CREATE TABLE public.genehmigungen(
  id integer NOT NULL,
  genehmigt boolean,
  kommentar text,
  CONSTRAINT genehmigungen_pkey PRIMARY KEY(id)
);

CREATE TABLE public.questions(
id serial NOT NULL, question text NOT NULL,
  CONSTRAINT questions_pkey PRIMARY KEY(id)
);


CREATE TABLE public.stand(
  id serial NOT NULL,
  auth_id text NOT NULL,
  ort text NOT NULL,
  ort_spezifikation text NOT NULL,
  lehrer text NOT NULL,
  email text NOT NULL,
  klasse text NOT NULL,
  name text NOT NULL,
  beschreibung text NOT NULL,
  genehmigungs_id serial NOT NULL UNIQUE,
  CONSTRAINT stand_pkey PRIMARY KEY(id),
  CONSTRAINT stand_auth_id_key UNIQUE(auth_id)
);

CREATE TABLE public.standQuestions(
stand_id integer NOT NULL, question_id integer NOT NULL,
  CONSTRAINT "standQuestions_pkey" PRIMARY KEY(stand_id, question_id)
);

CREATE TABLE public.trusted_ids(
id serial NOT NULL, "trusted" text NOT NULL,
  CONSTRAINT trusted_ids_pkey PRIMARY KEY(id)
);

ALTER TABLE public.standQuestions
  ADD CONSTRAINT "standQuestions_stand_id_fkey"
    FOREIGN KEY (stand_id) REFERENCES public.stand (id);

ALTER TABLE public.standQuestions
  ADD CONSTRAINT "standQuestions_question_id_fkey"
    FOREIGN KEY (question_id) REFERENCES public.questions (id);

ALTER TABLE public.genehmigungen
  ADD CONSTRAINT genehmigungen_stand_id_fkey
    FOREIGN KEY (id) REFERENCES public.stand (genehmigungs_id);
