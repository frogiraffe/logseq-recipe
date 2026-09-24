import type { ConversionSourceNode } from "../src/application/convert-recipe";

// A real-world paste, block for block as Logseq stored it: a Turkish recipe
// with English headings where the metadata sits on the title block, headings
// share a block with their items, steps landed next to their heading, and
// one step carries a genuinely nested child. Shared by the demo harness
// (?convert=cookies) and the live Logseq test.
const node = (
  id: string,
  title: string,
  children: ConversionSourceNode[] = [],
): ConversionSourceNode => ({ id, title, children });

export const COOKIE_PASTE: ConversionSourceNode = node(
  "paste",
  "Chunky Chocolate Chip Cookies\nYield: 4 cookies\nPrep: 15 min\nCook: 11 min",
  [
    node(
      "b1",
      "Ingredients\n60 g tereyağı\n66 g esmer şeker\n39 g beyaz şeker\n26 g çırpılmış yumurta\n1/2 çay kaşığı vanilya\n100 g un\n8 g mısır nişastası\n0,3 çay kaşığı karbonat\n0,3 çay kaşığı kabartma tozu\n0,3 çay kaşığı tuz\n42 g sütlü çikolata\n43 g bitter çikolata",
    ),
    node(
      "b2",
      "Steps\nTereyağını erit ve 5-10 dakika ılımaya bırak.\n  Tereyağını kahverengileştirme.",
    ),
    node(
      "b3",
      "Esmer şeker ve beyaz şekeri tereyağına ekleyip 1-2 dakika karıştır.",
    ),
    node(
      "b4",
      "Çırpılmış yumurtayı ve vanilyayı ekleyip homojen olana kadar karıştır.",
    ),
    node(
      "b5",
      "Un, mısır nişastası, karbonat, kabartma tozu ve tuzu ekle.\n  Un tamamen kaybolduğu anda karıştırmayı bırak. Hamuru fazla karıştırma.",
    ),
    node(
      "b6",
      "Çikolataların yaklaşık 70 g kadarını hamura kat.\n  Kalan yaklaşık 15 g çikolatayı cookie'lerin üzerine koymak için ayır.",
    ),
    node(
      "b7",
      "Hamuru 4 adet uzun ve hafif düzensiz, yaklaşık 85-90 g'lık top hâline getir.",
    ),
    node(
      "b8",
      "Buzdolabında en az 2 saat soğut.\n  İdeal soğutma süresi 3-4 saattir.",
    ),
    node("b9", "Fırını 190°C alt-üst ayarda önceden ısıt."),
    node(
      "b10",
      "Cookie'leri 190°C'de 10-12 dakika pişir.\n  Kenarlar hafif renk almış olmalı ancak merkez hâlâ yumuşak görünmeli.\n  15-16 dakikaya kadar pişirme.",
      [
        node(
          "b10a",
          "Tepsiyi fırından çıkar ve cookie'leri tepsinin üzerinde 10-15 dakika dinlendir.",
        ),
      ],
    ),
    node(
      "b11",
      "Notes\nHedef doku hafif kıtır ve dağılan kenarlar, yumuşak-chewy merkez ve erimiş iri çikolata parçalarıdır.",
    ),
    node("b12", "Çikolata karışımı yaklaşık yarı sütlü, yarı bitterdir."),
    node(
      "b13",
      "Cookie'ler fırından çıktığında merkezlerinin tam pişmemiş gibi görünmesi normaldir. Tepside dinlenirken kıvam alırlar.",
    ),
  ],
);
