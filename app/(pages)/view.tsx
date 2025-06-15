import dynamic from 'next/dynamic';

const Page = dynamic(() => import('../(pages)/article-reader/page'), { ssr: false });

export default Page;

