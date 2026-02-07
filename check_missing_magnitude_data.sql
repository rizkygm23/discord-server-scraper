-- Query ini mencari user yang:
-- 1. Punya setidaknya satu role "Magnitude ..." (array_to_string digunakan karena roles adalah array)
-- 2. Kolom role_kamis DAN role_jumat masih NULL
-- Gunanya untuk mendeteksi user mana yang rolenya TERLEWATKAN oleh scraper.

SELECT 
    username, 
    roles, 
    role_kamis, 
    role_jumat
FROM seismic_dc_user
WHERE 
    -- Cek jika punya minimal satu Magnitude (1.0 s/d 9.9)
    -- Kita convert array roles jadi string dulu biar gampang di-regex
    array_to_string(roles, ',') ~* 'Magnitude [1-9]'
    
    -- DAN kedua kolom snapshot kosong
    AND role_kamis IS NULL 
    AND role_jumat IS NULL;
