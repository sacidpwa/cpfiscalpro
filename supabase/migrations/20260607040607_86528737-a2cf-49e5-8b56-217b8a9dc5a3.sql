
INSERT INTO public.incident_types (codigo, nombre, descripcion, paga, cuenta_falta, color, orden)
VALUES ('SUS', 'Suspensión', 'Suspensión laboral sin goce de sueldo', false, true, '#9333ea', 10)
ON CONFLICT DO NOTHING;
