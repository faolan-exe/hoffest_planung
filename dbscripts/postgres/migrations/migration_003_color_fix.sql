-- Migration: Stand Tabelle um Spalte 'farbe' erweitern
ALTER TABLE public.stand
ADD COLUMN farbe text DEFAULT (
  ARRAY[
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4',
    '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', '#008080', '#e6beff',
    '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1',
    '#000075', '#808080', '#3a8592', '#ff0000', '#00ff00', '#0000ff',
    '#ffff00', '#ff00ff', '#00ffff', '#c0c0c0', '#800080', '#ff7f00',
    '#bfff00', '#7f00ff', '#00bfff', '#ff1493', '#7fff00', '#ff69b4',
    '#1e90ff', '#32cd32', '#ff4500', '#da70d6', '#00fa9a', '#ffd700',
    '#adff2f', '#4b0082', '#ff6347', '#40e0d0', '#9acd32', '#ffb6c1',
    '#6a5acd', '#20b2aa', '#ff8c00', '#db7093'
  ])[floor(random()*50+1)]
;

-- Zufällige Farben zuweisen für bestehende Stände
UPDATE public.stand
SET farbe = (
  ARRAY[
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4',
    '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', '#008080', '#e6beff',
    '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1',
    '#000075', '#808080', '#3a8592', '#ff0000', '#00ff00', '#0000ff',
    '#ffff00', '#ff00ff', '#00ffff', '#c0c0c0', '#800080', '#ff7f00',
    '#bfff00', '#7f00ff', '#00bfff', '#ff1493', '#7fff00', '#ff69b4',
    '#1e90ff', '#32cd32', '#ff4500', '#da70d6', '#00fa9a', '#ffd700',
    '#adff2f', '#4b0082', '#ff6347', '#40e0d0', '#9acd32', '#ffb6c1',
    '#6a5acd', '#20b2aa', '#ff8c00', '#db7093'
  ])[floor(random()*50+1)]
;

-- Insert migration record
INSERT INTO migrations (migration_name) 
VALUES ('migration_003_color_fix.sql') 
ON CONFLICT (migration_name) DO NOTHING;
