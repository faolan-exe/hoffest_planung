-- Migration: Stand Tabelle um Spalte 'farbe' erweitern
ALTER TABLE public.stand
ADD COLUMN farbe text DEFAULT (
  ARRAY[
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4',
    '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', '#008080', '#e6beff',
    '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1',
    '#000075', '#808080', '#3a8592', '#000000', '#ff0000', '#00ff00',
    '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#c0c0c0', '#800080'
  ])[floor(random()*30+1)]
;

-- Zufällige Farben zuweisen
UPDATE public.stand
SET farbe = (
  ARRAY[
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4',
    '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', '#008080', '#e6beff',
    '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1',
    '#000075', '#808080', '#3a8592', '#000000', '#ff0000', '#00ff00',
    '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#c0c0c0', '#800080'
  ])[floor(random()*30+1)]
;

-- Insert migration record
INSERT INTO migrations (migration_name) 
VALUES ('migration_003_color_fix.sql') 
ON CONFLICT (migration_name) DO NOTHING;
