-- Query untuk melihat user yang mendapatkan promosi
-- Promosi dideteksi jika nilai Magnitude pada Jumat (role_jumat) lebih besar dari Kamis (role_kamis)
-- dan flag is_promoted bernilai TRUE

SELECT 
    username, 
    display_name, 
    role_kamis AS magnitude_sebelumnya, 
    role_jumat AS magnitude_sekarang,
    (role_jumat - role_kamis) AS kenaikan
FROM 
    seismic_dc_user
WHERE 
    is_promoted = TRUE
    -- Opsional: Pastikan data valid (tidak null)
    AND role_kamis IS NOT NULL 
    AND role_jumat IS NOT NULL
ORDER BY 
    kenaikan DESC,
    role_jumat DESC;
