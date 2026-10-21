import type { ChapterVolume } from '../types/lexicon.ts';

export interface VolumeInfo {
  id: ChapterVolume;
  title: { it: string; en: string; pl: string };
  subtitle: { it: string; en: string; pl: string };
  author: string;
  /** Original Polish volume the chapters come from. */
  source: string;
}

export const SERIES_TITLE = {
  it: 'Il sacrificio cruento nella Grecia antica alla luce dei dati filologici',
  en: 'Blood sacrifice in Ancient Greece in the light of philological data', pl: 'Ofiara krwawa w Grecji starożytnej w świetle danych filologicznych',
};

export const VOLUMES: VolumeInfo[] = [
  {
    id: 'hom',
    title: { it: 'Omero', en: 'Homer', pl: 'Homer' },
    subtitle: { it: 'Iliade e Odissea', en: 'Iliad and Odyssey', pl: 'Iliada i Odyseja' },
    author: 'Lech Trzcionkowski',
    source: 'Ofiara krwawa w Grecji starożytnej w świetle danych filologicznych. Homer, Warszawa 2017',
  },
  {
    id: 'trag',
    title: { it: 'Tragedia attica', en: 'Attic tragedy', pl: 'Tragedia attycka' },
    subtitle: { it: 'Eschilo, Sofocle, Euripide', en: 'Aeschylus, Sophocles, Euripides', pl: 'Ajschylos, Sofokles, Eurypides' },
    author: 'Krzysztof Bielawski',
    source: 'Ofiara krwawa w Grecji starożytnej w świetle danych filologicznych. Tragedia attycka, Warszawa 2017',
  },
  {
    id: 'com',
    title: { it: 'Commedia antica', en: 'Old Attic comedy', pl: 'Stara komedia attycka' },
    subtitle: { it: 'Aristofane', en: 'Aristophanes', pl: 'Arystofanes' },
    author: 'Bartłomiej Bednarek',
    source: 'Ofiara krwawa w Grecji starożytnej w świetle danych filologicznych. Stara komedia attycka, Warszawa 2017',
  },
  {
    id: 'cpch',
    title: { it: 'Corpus Platonicum e Hippocraticum', en: 'Corpus Platonicum and Hippocraticum', pl: 'Corpus Platonicum. Corpus Hippocraticum' },
    subtitle: { it: 'Platone e il Corpus ippocratico', en: 'Plato and the Hippocratic Corpus', pl: 'Platon i Corpus Hippocraticum' },
    author: 'Przemysław Biernat',
    source: 'Ofiara krwawa w Grecji starożytnej w świetle danych filologicznych. Corpus Platonicum. Corpus Hippocraticum, Warszawa 2017',
  },
];
