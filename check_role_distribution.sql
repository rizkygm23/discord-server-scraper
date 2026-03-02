-- Cek distribusi role_jumat dari Magnitude 1.0 sampai 9.0
SELECT 
    role_jumat AS magnitude, 
    COUNT(*) AS total_pengguna
FROM 
    seismic_dc_user
WHERE 
    role_jumat >= 1.0 AND role_jumat <= 9.0
GROUP BY 
    role_jumat
ORDER BY 
    role_jumat ASC;

--==========================================

-- Cek detail data usernya (Contoh: mencari tau siapa saja yang punya Magnitude 4.0)
SELECT id, username, display_name, role_jumat
FROM seismic_dc_user
WHERE role_jumat = 4.0;
