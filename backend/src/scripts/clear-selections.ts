
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Clearing Selection table...');
    try {
        // Delete all selections to allow schema change (unique photoId)
        // and removing client references.
        const { count } = await prisma.selection.deleteMany({});
        console.log(`Deleted ${count} selections.`);
    } catch (error) {
        console.error('Error clearing selections:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
