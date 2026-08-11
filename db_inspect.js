const { PrismaClient } = require('/var/www/project-absenta/absenta_backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const totalAbsenGuru = await prisma.absenGuru.count();
  const totalSesiAbsensi = await prisma.sesiAbsensi.count();

  const todayStr = new Date().toISOString().split('T')[0];
  const todayStart = new Date(`${todayStr}T00:00:00.000Z`);

  const absenGuruToday = await prisma.absenGuru.findMany({
    where: { created_at: { gte: todayStart } },
    include: {
      Guru: { select: { nama_guru: true } },
      SesiAbsensi: { select: { id: true, status: true, tanggal: true } }
    }
  });

  const sesiAbsensiToday = await prisma.sesiAbsensi.findMany({
    where: { created_at: { gte: todayStart } },
    include: {
      Guru: { select: { nama_guru: true } },
      Kelas: { select: { nama_kelas: true } }
    }
  });

  console.log('=== ABSENTA PRODUCTION DB STATUS ===');
  console.log('Total AbsenGuru records:', totalAbsenGuru);
  console.log('Total SesiAbsensi records:', totalSesiAbsensi);
  console.log('AbsenGuru records created today:', absenGuruToday.length);
  console.log('SesiAbsensi records created today:', sesiAbsensiToday.length);

  console.log('\n=== ABSEN GURU TODAY ===');
  console.log(JSON.stringify(absenGuruToday, null, 2));

  console.log('\n=== SESI ABSENSI TODAY ===');
  console.log(JSON.stringify(sesiAbsensiToday, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
