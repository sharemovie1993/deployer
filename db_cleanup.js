const { PrismaClient } = require('/var/www/project-absenta/absenta_backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const targetAbsenIds = [
    "9e8836a5-899f-4332-82d0-004939d9994f",
    "d01a6da8-300b-4a77-bf17-e1e999ce46d8"
  ];

  const targetSesiIds = [
    "2a25e39e-b5b5-4d71-9464-660c5bfb4649",
    "09475761-12d4-40ab-97cd-894621bc4621"
  ];

  const deletedAbsen = await prisma.absenGuru.deleteMany({
    where: {
      id: { in: targetAbsenIds }
    }
  });

  const deletedSesi = await prisma.sesiAbsensi.deleteMany({
    where: {
      id: { in: targetSesiIds }
    }
  });

  console.log('✅ CLEANUP COMPLETED');
  console.log('Deleted AbsenGuru records count:', deletedAbsen.count);
  console.log('Deleted SesiAbsensi records count:', deletedSesi.count);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
