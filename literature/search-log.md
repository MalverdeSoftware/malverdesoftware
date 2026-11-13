# Search log

**Question.** What is published on Jesús Malverde / Jesús Maaso: who he was, the evidence for him, any Yoreme or Yoeme identity, and how he is remembered?

**Date.** November 5, 2026. Run by Claude Code for the author.

## Services and queries

| Service | Query or goal | Used for |
|---|---|---|
| Undermind deep search | Natural-language goal covering Malverde, Maaso, Juárez Mazo, historicity, Indigenous identity, devotion, corridos, narcoculture, representations, comparative folk saints, and Yoreme context in the Porfiriato. [Results](https://app.undermind.ai/projects/756d5b39-6faf-4bd6-8fd8-e502f7843a3a) | 31 ranked papers |
| Undermind semantic search | English and Spanish sample abstracts on Malverde; Mayo in northern Sinaloa during the Porfiriato | Added works the deep search ranked lower or missed |
| Undermind metadata lookup | 20 named works found through citations | Cite keys. Most DOIs returned for books were book reviews, so they were not used |
| Undermind PDF reader | Rocha 2019, Sotelo Chávez 2021, Fabián Jiménez 2025, Cázares Aboytes 2013 | Targeted questions on name, evidence and identity |
| Firecrawl search | Malverde + evidence and name variants; + Yoreme, Mayo, Yaqui, Yoeme; "Jesús Maaso"; + Bachomo and Bernal; López Alanís + 1888 record; Mazo + Yoreme + Lizárraga; Jónsdóttir; Griffith, Quinones, Graziano, Price; Bachomo; Ortiz Castillo; Güemes, Diveinz, Cantarell; *maaso* as word and surname | Non-indexed sources, theses, press, regional history |
| Firecrawl page extraction | Price 2005 (HAL), Perea Romo 2020, Calvo-Quirós 2022, Rodríguez 2003, Flores and González 2006, Fabián Jiménez 2025, Perea Romo 2026, López 2021, Gray 2026, Spanish Wikipedia, UAS corpus | Claims and bibliographies |
| Wikipedia API | English article wikitext and edit-summary search | Tracing the Yoreme heritage sentence |
| Crossref, Open Library | DOI and book records | Metadata checks |

## Selection

**Kept:** works substantially about Malverde; comparative works treating him as a real case; regional Yoreme and Yoeme history for context, marked as not about Malverde; and press only where it carries a claim that matters.

**Not added:**

- Book reviews (Pastor and Acuña 2016; Reséndiz 2013; Riobó 2018). Review DOIs were not assigned to the books.
- Duplicate Undermind records for the same work (Rocha's English abstract, Gómez Michel 2009, Creechan 2005).
- A Japanese translation of Quinones (2007).
- Works on other folk saints that don't treat Malverde substantially, such as Santa Muerte studies, Chesnut 2012 and Vanderwood 2004.
- Social-media posts, and bandit theory (Hobsbawm, Joseph, Vanderwood 1981) that Price cites.

**Leads not yet verified, so not added:**

- César Güemes, "Jesús Malverde: de bandido generoso a santo laico" (journalism prize, 2000)
- Marlene Diveinz, *Malverde: de la leyenda a la santidad* (excerpted in *Proceso*, 2020)
- Ochoa 2010 and López and Alarcón 2018, cited on Bachomo by Soto Sánchez
- "Culto a los criminales", *La Patria*, August 1, 1903, cited by Perea Romo 2026, which may bear on bandit devotion before 1909
- Figueroa Valenzuela's other work on Yaqui and Mayo identity

## Coverage limits

- Undermind searches titles and abstracts in scholarly indexes. Sinaloan books, local journals, archives and oral history are thinly covered. Its summary says as much: the records do not establish existence, the Maaso or Mazo names, or Yoreme or Yoeme identity.
- "Not found" means not found in this search, on one day, not that nothing exists.
- Machine reading. Firecrawl and Undermind answers come from a model reading the document. Only the Perea Romo passages, the Flores and González opening, the Calvo-Quirós excerpts, Soto Sánchez 2020, the Wikipedia articles and the UAS corpus entries were seen as source text. Page numbers came from extraction and need checking. The extraction of Calvo-Quirós named both Griffith and Quinones for the amalgam claim, and the endnotes could not be extracted.
- Facebook pages, including the Archivo Histórico General de Sinaloa's post on who Malverde was, could not be scraped. Only its search excerpt was seen.
- ResearchGate and Academia.edu landing pages were opened once each to identify works. No text from them is used, and the hub's rule against using them for open copies was kept.
- Paywalled core works were not read: Gómez Michel and Park 2014, Creechan and De la Herrán 2005, Partida Tayzán 2011.
- Metadata status in the library is separate from reading: `registry-verified` and `source-verified` confirm the record, not any claim. The 25 `needs-review` works are known only from citing works or a thin record, and their details need checking before citation.

## Reconciliation and Zotero pass, November 5, 2026

**Undermind deep search, all 31 records:** 25 are in the library. Bur03 is Griffith 2003, Dav11 is Flores and González 2011, San96 is López Sánchez 1996, and Sol07 is Hidalgo Solís 2007. Not added as works: Roc19, Cre05 and Gom09 are duplicate records; Pas16 and Res13 are book reviews; Qui07 is a Japanese translation of Quinones.

**Zotero, read-only copy:** searched every item's fields for Malverde, Bachomo, Maaso, Heraclio, folk saint and santo popular. Only one attachment name matched, "Maaso et al. - 1993". The Yaqui collection (45 records) was then added at the author's request: 42 new works, with 2 duplicates merged and one work already in the library. Records were corrected using the PDFs' cover pages, and DOIs were checked against Crossref. `inherited` means the details came from Zotero as entered. Felger and Molina 2024 was also added, from a search excerpt.

**Added searches:** an Undermind semantic search on the Maaso family and Yoreme memory of Bachomo, and a Firecrawl search on Maaso. Neither connected the name to Malverde.

**Limit:** the Yaqui PDFs were read only for citation details, plus a name search in Maaso et al. 1993, and not for their content. Spicer 1940's author and year were supplied by Claude and need checking.

## Second pass, November 6, 2026

**Concept pipeline, batch B09:** ran on 36 works for $5.80 of a $15 cap, with results and exclusions in [README.md](README.md). It used the Zotero attachments named one by one for the Yaqui folder, plus 6 Malverde PDFs held locally in `literature/pdfs/` and not committed.

**Endnotes checked in Calvo-Quirós 2022:** the Bachomo amalgam phrase comes from Quinones 2001, p. 227 (endnote 10). The Yoreme rescue comes from Liera's 1984 play (endnote 39). Griffith 2003 is cited at pp. 66-68 (endnote 11).

**Concept pipeline, batch B11:** ran on 3 works for $1.60 of a $6 cap, after filling in five records. Sources for the details: the PDFs' own pages for Diario de Campo 8 and Yaquis: memoria; the PDF and INPI's page for the Plan de Justicia; UNAM's repository and thesis list, plus citing works, for Civilizar and Lucha social.

**Left out of B11:** Padilla and Marat 2020 is a 13-page photo essay with captions only. Lucha social and Civilizar have PDFs that block copying and printing, and they were not opened.

**Limit:** the pipeline's model read these works for concept links. Nobody checked its links against the papers.
