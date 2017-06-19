"use strict"
require('dotenv').config();
const Epub = require("epub-gen");
const Crawler = require("crawler");
const normalizeUrl = require('normalize-url');
const compareUrls = require('compare-urls');
const sanitizeHtml = require('sanitize-html');
const request = require('requestretry');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');
const md5 = require('md5');
const fs = require('fs');
const express = require('express');
const app = express();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_SENDER,
        pass: process.env.EMAIL_SENDER_PASS
    }
});

console.time("Time taken to generate epub: ");

const generateEpub = (articleHTML) => {
    const title = "斗罗大陆";
    const author = "唐家三少";
    const publisher = "Jacob Goh";
    const cover = "http://image.jjmh.com/file/userfiles/images/21.jpg";
    let content = [];
    let removeString = [' - 斗罗大陆 - 唐家三少 - 无弹窗小说网', '无弹窗小说网'];

    let tempArticleHTML = []
    for (let i = 0; i < Object.keys(articleHTML).length; i++) {
        tempArticleHTML[i] = articleHTML[i];
    }
    articleHTML = [...tempArticleHTML];

    articleHTML.map(html => {
        const $ = cheerio.load(html);
        let chapterTitle = $('title').text();
        let chapterData = $('#main .book p').html();
        chapterData = sanitizeHtml(chapterData);

        removeString.map((str) => {
            chapterTitle = chapterTitle.replace(str, '');
            chapterData = chapterData.replace(str, '');
        })
        content.push({title: chapterTitle, data: chapterData});
    })

    let option = {
        title, // *Required, title of the book.
        author, // *Required, name of the author.
        publisher, // optional
        cover, // Url or File path, both ok.
        content,
        css: ""
    };
    const epubFileName = `${title}-${md5(new Date())}.epub`;
    const epubFileLocation = __dirname + `/${epubFileName}`;
    new Epub(option, epubFileLocation)
        .promise
        .then(function () {
            console.log("Ebook Generated Successfully!")
            console.timeEnd("Time taken to generate epub: ");
            request.post({
                url: 'https://uguu.se/api.php?d=upload-tool',
                formData: {
                    file: fs.createReadStream(epubFileLocation)
                }
            }, function (error, response, body) {
                if (error) 
                    throw error;
                if (!error && response.statusCode == 200) {
                    const downloadLink = body;
                    console.log(`download link: ${downloadLink}`);

                    // remove file
                    fs.unlink(epubFileLocation, err => {
                        if (err) {
                            throw err;
                        }
                        console.log(`removed: ${epubFileLocation}`)
                    });

                    transporter.sendMail({
                        from: 'youremail@gmail.com',
                        to: 'jacobgoh101@gmail.com',
                        subject: 'zai-xian-xiao-shuo--to--epub',
                        text: `download link: ${downloadLink} \n This link will expire in 24 hours.`
                    }, function (error, info) {
                        if (error) {
                            console.log(error);
                        } else {
                            console.log('Email sent: ' + info.response);
                        }
                    });
                }
            });
        }, function (err) {
            console.error("Failed to generate Ebook because of ", err)
        });
}

const tableOfContentPage = normalizeUrl("http://www.hkxs99.net/01/douluodalu/", {stripWWW: false});
const jQuerySelector = "#main .book a";
let chapterLength = 0;
let articleHTML = {};
// crawl
const c = new Crawler({
    maxConnections: 10, incomingEncoding: 'GB2312',
    // This will be called for each crawled page
    callback: function (error, res, done) {
        if (error) {
            console.log(error);
        } else {
            const $ = res.$;
            const thisUrl = res.request.uri.href;
            if (compareUrls(thisUrl, tableOfContentPage)) {
                chapterLength = $(jQuerySelector).length;

                $(jQuerySelector).each((index, element) => {
                    const href = $(element).attr('href');
                    const url = tableOfContentPage + '/' + href;
                    request({
                        url,
                        encoding: null,
                        maxAttempts: 50,
                        retryDelay: 500
                    }, function (error, response, html) {
                        if (error) 
                            throw error;
                        if (!error && response.statusCode == 200) {
                            const utf8String = iconv.decode(new Buffer(html), "GB2312");
                            articleHTML[index] = utf8String;
                        }
                        if (Object.keys(articleHTML).length === chapterLength) {
                            console.log(`before generateEpub. chapterLength:${chapterLength}`);
                            generateEpub(articleHTML);
                        }
                    });
                });
            } else {}
        }
        done();
    }
});
c.queue(tableOfContentPage);

app.listen(process.env.PORT || 3000);