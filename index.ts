import * as Crawler from 'crawler';
import 'cheerio';
import * as url from 'url';
import * as minimist from 'minimist';
import * as process from 'process';
import * as fs from 'fs';
import * as archiver from 'archiver';
import * as http from 'http';
import { last } from 'lodash';
const argv = minimist(process.argv.slice(2));

const rootUrl = argv._[0];

// create a file to stream archive data to.
const output = fs.createWriteStream(__dirname + '/manga.cbz');
const archive = archiver('zip', {
    store: true // Sets the compression method to STORE.
});
output.on('close', function() {
  console.log(`Done! - ${total} images downloaded`);
});
archive.on('error', function(err: any) {
  console.error(err);
});
// pipe archive data to the file
archive.pipe(output);

let total = 0;
let pendingCount = 0;
let done = false;
function dlImage(url: string, name: string) {
  total++;
  pendingCount++;
  http.get(url, response => {
    pendingCount--;
    archive.append(response as any, { name });
    if (!pendingCount && done) {
      archive.finalize();
    }
  });
}

const c = new Crawler({
  maxConnections: 5,
  onDrain: function (pool: any) {
    done = true;
    c.pool.destroyAllNow();
  },
    callback : function (error: any, result: any, $: CheerioAPI) {
        if(error){
          console.error(error);
          return;
        }

        const imgUrl = $('img#image').attr('src');
        dlImage(url.resolve(result.uri, imgUrl), last(imgUrl.split('/')));

        const nextUrl = $('a.next_page').attr('href');
        if (nextUrl && /\d+\.html/.test(nextUrl)) {
          c.queue(url.resolve(result.uri, nextUrl));
        }
    }
});

c.queue(rootUrl);