const { supabase } = require('./supabase');
const { loadProjectConfig, getProject } = require('./project-config');

async function showPromotions() {
    const config = loadProjectConfig();
    const project = getProject(config.defaultProject);
    const tableName = project.tableName;

    console.log(`Mengambil data promosi dari tabel: ${tableName}...\n`);

    const { data, error } = await supabase
        .from(tableName)
        .select('username, display_name, role_kamis, role_jumat')
        .eq('is_promoted', true)
        .not('role_kamis', 'is', null)
        .not('role_jumat', 'is', null);

    if (error) {
        console.error('Gagal mengambil data:', error.message);
        return;
    }

    if (!data || data.length === 0) {
        console.log('Tidak ada pengguna yang terdeteksi naik role minggu ini.');
        return;
    }

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║               DAFTAR PENGGUNA YANG NAIK ROLE                 ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
    
    data.forEach((member, index) => {
        const diff = (member.role_jumat - member.role_kamis).toFixed(1);
        console.log(`${index + 1}. ${member.display_name || member.username} (@${member.username})`);
        console.log(`   Mag: ${member.role_kamis} ➔ ${member.role_jumat} (Naik +${diff})`);
        console.log('--------------------------------------------------------------');
    });
}

showPromotions().catch(console.error);
