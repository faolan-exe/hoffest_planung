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
  id serial NOT NULL,
  admin_id integer NOT NULL,
  genehmigt boolean NOT NULL,
  kommentar text NOT NULL,
  CONSTRAINT genehmigungen_pkey PRIMARY KEY(id)
);

CREATE TABLE public.questions(
id serial NOT NULL, question text NOT NULL,
  CONSTRAINT questions_pkey PRIMARY KEY(id)
);

CREATE TABLE public.staende(
stand_id integer NOT NULL, genehmigungs_prozess integer NOT NULL,
  CONSTRAINT staende_pkey PRIMARY KEY(stand_id, genehmigungs_prozess)
);

CREATE TABLE public.stand(
  id serial NOT NULL,
  auth_id text NOT NULL,
  ort text NOT NULL,
  ort_spezifikation text NOT NULL,
  lehrer text NOT NULL,
  klasse text NOT NULL,
  name text NOT NULL,
  beschreibung text NOT NULL,
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

ALTER TABLE public.genehmigungen
  ADD CONSTRAINT genehmigungen_admin_id_fkey
    FOREIGN KEY (admin_id) REFERENCES public."admin" (id) ON DELETE No action
      ON UPDATE No action;

ALTER TABLE public.staende
  ADD CONSTRAINT staende_genehmigungs_prozess_fkey
    FOREIGN KEY (genehmigungs_prozess) REFERENCES public.genehmigungen (id)
      ON DELETE No action ON UPDATE No action;

ALTER TABLE public.staende
  ADD CONSTRAINT staende_stand_id_fkey
    FOREIGN KEY (stand_id) REFERENCES public.stand (id) ON DELETE No action
      ON UPDATE No action;

ALTER TABLE public.standQuestions
  ADD CONSTRAINT "standQuestions_stand_id_fkey"
    FOREIGN KEY (stand_id) REFERENCES public.stand (id);

ALTER TABLE public.standQuestions
  ADD CONSTRAINT "standQuestions_question_id_fkey"
    FOREIGN KEY (question_id) REFERENCES public.questions (id);

