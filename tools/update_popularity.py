#!/usr/bin/env python3
"""Update static Wikipedia pageview popularity data for Phil.

Popularity means sustained public interest, measured as average English
Wikipedia pageviews per day over a rolling 10-year window. The normalized
score is for display only; the site sorts by avg_views_per_day.
"""
from __future__ import annotations

import json
import math
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PHILOSOPHERS_PATH = ROOT / "data" / "philosophers.json"
POPULARITY_PATH = ROOT / "data" / "popularity.json"
YEARS = 10
SLEEP_SECONDS = 0.25
USER_AGENT = "PhilPopularityUpdater/1.0 (https://github.com/andreas/phil; manual script)"

# Exact, manually maintained Wikipedia article titles. Do not fuzzy match.
WIKIPEDIA_TITLES = {
    "Abelard, Peter": "Peter_Abelard",
    "Adorno, Theodor": "Theodor_W._Adorno",
    "Al-Farabi": "Al-Farabi",
    "Al-Ghazali": "Al-Ghazali",
    "Al-Kindi": "Al-Kindi",
    "Albert the Great": "Albertus_Magnus",
    "Althusser, Louis": "Louis_Althusser",
    "Ambedkar, B. R.": "B._R._Ambedkar",
    "Amo, Anton Wilhelm": "Anton_Wilhelm_Amo",
    "Anaxagoras": "Anaxagoras",
    "Anaximander": "Anaximander",
    "Anaximenes": "Anaximenes_of_Miletus",
    "Anscombe, G. E. M.": "G._E._M._Anscombe",
    "Anselm of Canterbury": "Anselm_of_Canterbury",
    "Appiah, Kwame Anthony": "Kwame_Anthony_Appiah",
    "Aquinas, Thomas": "Thomas_Aquinas",
    "Arendt, Hannah": "Hannah_Arendt",
    "Aristotle": "Aristotle",
    "Armstrong, David": "David_Malet_Armstrong",
    "Aryadeva": "Aryadeva",
    "Asanga": "Asanga",
    "Astell, Mary": "Mary_Astell",
    "Atisha": "Atisa",
    "Augustine of Hippo": "Augustine_of_Hippo",
    "Aurelius, Marcus": "Marcus_Aurelius",
    "Aurobindo, Sri": "Sri_Aurobindo",
    "Averroes (Ibn Rushd)": "Averroes",
    "Avicenna (Ibn Sina)": "Avicenna",
    "Ayer, A. J.": "A._J._Ayer",
    "Bacon, Francis": "Francis_Bacon",
    "Badiou, Alain": "Alain_Badiou",
    "Beauvoir, Simone de": "Simone_de_Beauvoir",
    "Benjamin, Walter": "Walter_Benjamin",
    "Bentham, Jeremy": "Jeremy_Bentham",
    "Bergson, Henri": "Henri_Bergson",
    "Berkeley, George": "George_Berkeley",
    "Bhartrhari": "Bhartṛhari",
    "Bhaviveka": "Bhāviveka",
    "Block, Ned": "Ned_Block",
    "Boethius": "Boethius",
    "Bonaventure": "Bonaventure",
    "Brandom, Robert": "Robert_Brandom",
    "Brentano, Franz": "Franz_Brentano",
    "Buddha (Siddhartha Gautama)": "Gautama_Buddha",
    "Buddhaghosa": "Buddhaghosa",
    "Burge, Tyler": "Tyler_Burge",
    "Butler, Joseph": "Joseph_Butler",
    "Butler, Judith": "Judith_Butler",
    "Camus, Albert": "Albert_Camus",
    "Carnap, Rudolf": "Rudolf_Carnap",
    "Carneades": "Carneades",
    "Cavell, Stanley": "Stanley_Cavell",
    "Cavendish, Margaret": "Margaret_Cavendish",
    "Chaitanya Mahaprabhu": "Chaitanya_Mahaprabhu",
    "Chalmers, David": "David_Chalmers",
    "Chandrakirti": "Chandrakirti",
    "Cheng Hao": "Cheng_Hao",
    "Cheng Yi": "Cheng_Yi_(philosopher)",
    "Chomsky, Noam": "Noam_Chomsky",
    "Chrysippus": "Chrysippus",
    "Churchland, Patricia": "Patricia_Churchland",
    "Churchland, Paul": "Paul_Churchland",
    "Cicero": "Cicero",
    "Cixous, Hélène": "Hélène_Cixous",
    "Comte, Auguste": "Auguste_Comte",
    "Confucius": "Confucius",
    "Conway, Anne": "Anne_Conway_(philosopher)",
    "Crescas, Hasdai": "Hasdai_Crescas",
    "Dai Zhen": "Dai_Zhen",
    "Davidson, Donald": "Donald_Davidson_(philosopher)",
    "Daya Krishna": "Daya_Krishna",
    "Deleuze, Gilles": "Gilles_Deleuze",
    "Democritus": "Democritus",
    "Dennett, Daniel": "Daniel_Dennett",
    "Derrida, Jacques": "Jacques_Derrida",
    "Descartes, René": "René_Descartes",
    "Dewey, John": "John_Dewey",
    "Dharmakirti": "Dharmakīrti",
    "Diderot, Denis": "Denis_Diderot",
    "Dignaga": "Dignāga",
    "Diogenes of Sinope": "Diogenes",
    "Dogen": "Dōgen",
    "Dong Zhongshu": "Dong_Zhongshu",
    "Du Bois, W. E. B.": "W._E._B._Du_Bois",
    "Du Châtelet, Émilie": "Émilie_du_Châtelet",
    "Dummett, Michael": "Michael_Dummett",
    "Duns Scotus, John": "Duns_Scotus",
    "Dussel, Enrique": "Enrique_Dussel",
    "Dworkin, Ronald": "Ronald_Dworkin",
    "Eckhart, Meister": "Meister_Eckhart",
    "Elisabeth of Bohemia": "Elisabeth_of_the_Palatinate",
    "Empedocles": "Empedocles",
    "Epictetus": "Epictetus",
    "Epicurus": "Epicurus",
    "Eriugena, John Scotus": "Johannes_Scotus_Eriugena",
    "Fanon, Frantz": "Frantz_Fanon",
    "Feyerabend, Paul": "Paul_Feyerabend",
    "Fichte, Johann Gottlieb": "Johann_Gottlieb_Fichte",
    "Fine, Kit": "Kit_Fine",
    "Fodor, Jerry": "Jerry_Fodor",
    "Foot, Philippa": "Philippa_Foot",
    "Foucault, Michel": "Michel_Foucault",
    "Frege, Gottlob": "Gottlob_Frege",
    "Fricker, Miranda": "Miranda_Fricker",
    "Gadamer, Hans-Georg": "Hans-Georg_Gadamer",
    "Gandhi, Mohandas": "Mahatma_Gandhi",
    "Gangesa Upadhyaya": "Gangesha_Upadhyaya",
    "Gaudapada": "Gaudapada",
    "Gautama, Aksapada": "Aksapada_Gautama",
    "Gersonides": "Gersonides",
    "Gettier, Edmund": "Edmund_Gettier",
    "Gorgias": "Gorgias",
    "Gramsci, Antonio": "Antonio_Gramsci",
    "Grosseteste, Robert": "Robert_Grosseteste",
    "Guo Xiang": "Guo_Xiang",
    "Gyekye, Kwame": "Kwame_Gyekye",
    "Gödel, Kurt": "Kurt_Gödel",
    "Haack, Susan": "Susan_Haack",
    "Habermas, Jürgen": "Jürgen_Habermas",
    "Han Fei": "Han_Fei",
    "Hare, R. M.": "R._M._Hare",
    "Haribhadra": "Haribhadra",
    "Harman, Gilbert": "Gilbert_Harman",
    "Haslanger, Sally": "Sally_Haslanger",
    "Hayashi Razan": "Hayashi_Razan",
    "Hegel, G. W. F.": "Georg_Wilhelm_Friedrich_Hegel",
    "Heidegger, Martin": "Martin_Heidegger",
    "Hemachandra": "Hemachandra",
    "Heraclitus": "Heraclitus",
    "Herder, Johann Gottfried": "Johann_Gottfried_Herder",
    "Hildegard of Bingen": "Hildegard_of_Bingen",
    "Hobbes, Thomas": "Thomas_Hobbes",
    "Horkheimer, Max": "Max_Horkheimer",
    "Hountondji, Paulin": "Paulin_Hountondji",
    "Hume, David": "David_Hume",
    "Husserl, Edmund": "Edmund_Husserl",
    "Hypatia": "Hypatia",
    "Iamblichus": "Iamblichus",
    "Ibn Arabi": "Ibn_Arabi",
    "Ibn Khaldun": "Ibn_Khaldun",
    "Ibn Tufayl": "Ibn_Tufayl",
    "Iqbal, Muhammad": "Muhammad_Iqbal",
    "Irigaray, Luce": "Luce_Irigaray",
    "Ishvarakrishna": "Ishvarakrishna",
    "Jackson, Frank": "Frank_Cameron_Jackson",
    "James, William": "William_James",
    "Jaspers, Karl": "Karl_Jaspers",
    "Jayanta Bhatta": "Jayanta_Bhatta",
    "Jinul": "Jinul",
    "Judah Halevi": "Judah_Halevi",
    "Kamalashila": "Kamalaśīla",
    "Kanada": "Kanada_(philosopher)",
    "Kant, Immanuel": "Immanuel_Kant",
    "Kierkegaard, Søren": "Søren_Kierkegaard",
    "Korsgaard, Christine": "Christine_Korsgaard",
    "Kripke, Saul": "Saul_Kripke",
    "Krishnamurti, Jiddu": "Jiddu_Krishnamurti",
    "Kristeva, Julia": "Julia_Kristeva",
    "Kuhn, Thomas": "Thomas_Kuhn",
    "Kukai": "Kūkai",
    "Kumarila Bhatta": "Kumārila_Bhaṭṭa",
    "Kundakunda": "Kundakunda",
    "Lacan, Jacques": "Jacques_Lacan",
    "Langer, Susanne": "Susanne_Langer",
    "Laozi": "Laozi",
    "Leibniz, Gottfried Wilhelm": "Gottfried_Wilhelm_Leibniz",
    "Levinas, Emmanuel": "Emmanuel_Levinas",
    "Lewis, David": "David_Lewis_(philosopher)",
    "Locke, John": "John_Locke",
    "Lu Xiangshan": "Lu_Jiuyuan",
    "Lucretius": "Lucretius",
    "Lukács, György": "György_Lukács",
    "Lyotard, Jean-François": "Jean-François_Lyotard",
    "Macaulay, Catharine": "Catharine_Macaulay",
    "MacIntyre, Alasdair": "Alasdair_MacIntyre",
    "Mackie, J. L.": "J._L._Mackie",
    "Madhva": "Madhvacharya",
    "Maimonides": "Maimonides",
    "Malebranche, Nicolas": "Nicolas_Malebranche",
    "Mandana Misra": "Maṇḍana_Miśra",
    "Marcuse, Herbert": "Herbert_Marcuse",
    "Mariátegui, José Carlos": "José_Carlos_Mariátegui",
    "Marx, Karl": "Karl_Marx",
    "Masham, Damaris Cudworth": "Damaris_Cudworth_Masham",
    "Matilal, Bimal Krishna": "Bimal_Krishna_Matilal",
    "Mbembe, Achille": "Achille_Mbembe",
    "McDowell, John": "John_McDowell",
    "Mead, George Herbert": "George_Herbert_Mead",
    "Mencius": "Mencius",
    "Merleau-Ponty, Maurice": "Maurice_Merleau-Ponty",
    "Midgley, Mary": "Mary_Midgley",
    "Mill, Harriet Taylor": "Harriet_Taylor_Mill",
    "Mill, John Stuart": "John_Stuart_Mill",
    "Mohanty, J. N.": "Jitendra_Nath_Mohanty",
    "Montaigne, Michel de": "Michel_de_Montaigne",
    "Montesquieu": "Montesquieu",
    "Moore, G. E.": "G._E._Moore",
    "Mozi": "Mozi",
    "Mudimbe, V. Y.": "V._Y._Mudimbe",
    "Mulla Sadra": "Mulla_Sadra",
    "Murdoch, Iris": "Iris_Murdoch",
    "Nagarjuna": "Nagarjuna",
    "Nagel, Thomas": "Thomas_Nagel",
    "Nicholas of Cusa": "Nicholas_of_Cusa",
    "Nietzsche, Friedrich": "Friedrich_Nietzsche",
    "Nimbarka": "Nimbarka",
    "Nishida Kitaro": "Kitarō_Nishida",
    "Nozick, Robert": "Robert_Nozick",
    "Nussbaum, Martha": "Martha_Nussbaum",
    "O'Neill, Onora": "Onora_O'Neill",
    "Ockham, William of": "William_of_Ockham",
    "Ogyu Sorai": "Ogyū_Sorai",
    "Oruka, Henry Odera": "Henry_Odera_Oruka",
    "Parfit, Derek": "Derek_Parfit",
    "Parmenides": "Parmenides",
    "Pascal, Blaise": "Blaise_Pascal",
    "Patanjali": "Patanjali",
    "Peirce, Charles Sanders": "Charles_Sanders_Peirce",
    "Pettit, Philip": "Philip_Pettit",
    "Plantinga, Alvin": "Alvin_Plantinga",
    "Plato": "Plato",
    "Plotinus": "Plotinus",
    "Popper, Karl": "Karl_Popper",
    "Porphyry": "Porphyry_(philosopher)",
    "Prabhakara": "Prabhakara",
    "Proclus": "Proclus",
    "Protagoras": "Protagoras",
    "Putnam, Hilary": "Hilary_Putnam",
    "Pyrrho": "Pyrrho",
    "Pythagoras": "Pythagoras",
    "Quine, W. V. O.": "Willard_Van_Orman_Quine",
    "Radhakrishnan, Sarvepalli": "Sarvepalli_Radhakrishnan",
    "Raghunatha Siromani": "Raghunatha_Shiromani",
    "Ramanuja": "Ramanuja",
    "Ramsey, Frank": "Frank_Ramsey_(mathematician)",
    "Rand, Ayn": "Ayn_Rand",
    "Rawls, John": "John_Rawls",
    "Raz, Joseph": "Joseph_Raz",
    "Ricoeur, Paul": "Paul_Ricœur",
    "Rorty, Richard": "Richard_Rorty",
    "Rousseau, Jean-Jacques": "Jean-Jacques_Rousseau",
    "Russell, Bertrand": "Bertrand_Russell",
    "Ryle, Gilbert": "Gilbert_Ryle",
    "Saadia Gaon": "Saadia_Gaon",
    "Sandel, Michael": "Michael_Sandel",
    "Sartre, Jean-Paul": "Jean-Paul_Sartre",
    "Scanlon, T. M.": "T._M._Scanlon",
    "Schelling, F. W. J.": "Friedrich_Wilhelm_Joseph_Schelling",
    "Schopenhauer, Arthur": "Arthur_Schopenhauer",
    "Searle, John": "John_Searle",
    "Sellars, Wilfrid": "Wilfrid_Sellars",
    "Sen, Amartya": "Amartya_Sen",
    "Seneca": "Seneca_the_Younger",
    "Sextus Empiricus": "Sextus_Empiricus",
    "Shankara": "Adi_Shankara",
    "Shantarakshita": "Śāntarakṣita",
    "Shantideva": "Shantideva",
    "Shepherd, Mary": "Mary_Shepherd",
    "Singer, Peter": "Peter_Singer",
    "Smith, Adam": "Adam_Smith",
    "Sober, Elliott": "Elliott_Sober",
    "Socrates": "Socrates",
    "Sor Juana Inés de la Cruz": "Juana_Inés_de_la_Cruz",
    "Sosa, Ernest": "Ernest_Sosa",
    "Spinoza, Baruch": "Baruch_Spinoza",
    "Stalnaker, Robert": "Robert_Stalnaker",
    "Stein, Edith": "Edith_Stein",
    "Strawson, P. F.": "P._F._Strawson",
    "Suhrawardi": "Shahab_al-Din_Suhrawardi",
    "Swinburne, Richard": "Richard_Swinburne",
    "Tagore, Rabindranath": "Rabindranath_Tagore",
    "Tarski, Alfred": "Alfred_Tarski",
    "Taylor, Charles": "Charles_Taylor_(philosopher)",
    "Thales": "Thales_of_Miletus",
    "Thomson, Judith Jarvis": "Judith_Jarvis_Thomson",
    "Tsongkhapa": "Je_Tsongkhapa",
    "Tusi, Nasir al-Din": "Nasir_al-Din_al-Tusi",
    "Udayana": "Udayana",
    "Uddyotakara": "Uddyotakara",
    "Umasvati": "Umaswati",
    "Unamuno, Miguel de": "Miguel_de_Unamuno",
    "Vacaspati Misra": "Vacaspati_Misra",
    "Vallabha": "Vallabha",
    "van Fraassen, Bas": "Bas_van_Fraassen",
    "van Inwagen, Peter": "Peter_van_Inwagen",
    "Vasconcelos, José": "José_Vasconcelos",
    "Vasubandhu": "Vasubandhu",
    "Vatsyayana": "Vatsyayana",
    "Vivekananda, Swami": "Swami_Vivekananda",
    "Voltaire": "Voltaire",
    "Wang Bi": "Wang_Bi",
    "Wang Fuzhi": "Wang_Fuzhi",
    "Wang Yangming": "Wang_Yangming",
    "Warnock, Mary": "Mary_Warnock",
    "Watsuji Tetsuro": "Tetsuro_Watsuji",
    "Weil, Simone": "Simone_Weil",
    "West, Cornel": "Cornel_West",
    "Whitehead, Alfred North": "Alfred_North_Whitehead",
    "Williams, Bernard": "Bernard_Williams",
    "Williamson, Timothy": "Timothy_Williamson",
    "Wiredu, Kwasi": "Kwasi_Wiredu",
    "Wittgenstein, Ludwig": "Ludwig_Wittgenstein",
    "Wollstonecraft, Mary": "Mary_Wollstonecraft",
    "Wonhyo": "Wonhyo",
    "Xenophanes": "Xenophanes",
    "Xunzi": "Xunzi",
    "Yashovijaya": "Yashovijaya",
    "Yi Hwang (Toegye)": "Yi_Hwang",
    "Yi I (Yulgok)": "Yi_I",
    "Zea, Leopoldo": "Leopoldo_Zea_Aguilar",
    "Zeno of Citium": "Zeno_of_Citium",
    "Zeno of Elea": "Zeno_of_Elea",
    "Zhang Zai": "Zhang_Zai",
    "Zhou Dunyi": "Zhou_Dunyi",
    "Zhu Xi": "Zhu_Xi",
    "Zhuangzi": "Zhuangzi",
    "Žižek, Slavoj": "Slavoj_Žižek",
}


def console_text(value: str) -> str:
    return value.encode("ascii", "backslashreplace").decode("ascii")


def subtract_years(d: date, years: int) -> date:
    try:
        return d.replace(year=d.year - years)
    except ValueError:
        return d.replace(month=2, day=28, year=d.year - years)


def api_timestamp(d: date) -> str:
    return d.strftime("%Y%m%d")


def fetch_total_views(title: str, start: date, end: date) -> int:
    encoded_title = urllib.parse.quote(title.replace(" ", "_"), safe="")
    url = (
        "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/"
        f"en.wikipedia.org/all-access/user/{encoded_title}/daily/"
        f"{api_timestamp(start)}/{api_timestamp(end)}"
    )
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return 0
        raise
    return sum(item.get("views", 0) for item in payload.get("items", []))


def normalized_scores(averages: dict[str, int]) -> dict[str, int]:
    positive = [views for views in averages.values() if views > 0]
    if not positive:
        return {name: 0 for name in averages}

    min_views = min(positive)
    max_views = max(positive)
    if min_views == max_views:
        return {name: (100 if views > 0 else 0) for name, views in averages.items()}

    min_log = math.log(min_views)
    max_log = math.log(max_views)
    return {
        name: 0 if views <= 0 else round(100 * (math.log(views) - min_log) / (max_log - min_log))
        for name, views in averages.items()
    }


def main() -> None:
    philosophers = json.loads(PHILOSOPHERS_PATH.read_text(encoding="utf-8"))
    today = date.today()
    start = subtract_years(today, YEARS)
    days = max((today - start).days, 1)

    averages: dict[str, int] = {}
    for idx, philosopher in enumerate(philosophers, start=1):
        name = philosopher["name"]
        title = WIKIPEDIA_TITLES.get(name)
        if not title:
            raise KeyError(f"Missing Wikipedia title mapping for {name}")

        print(f"[{idx}/{len(philosophers)}] {console_text(name)} -> {console_text(title)}")
        total_views = fetch_total_views(title, start, today)
        averages[name] = round(total_views / days)
        time.sleep(SLEEP_SECONDS)

    scores = normalized_scores(averages)
    popularity = {
        philosopher["name"]: {
            "avg_views_per_day": averages[philosopher["name"]],
            "score": scores[philosopher["name"]],
        }
        for philosopher in philosophers
    }
    POPULARITY_PATH.write_text(json.dumps(popularity, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {POPULARITY_PATH.relative_to(ROOT)} for {start.isoformat()} to {today.isoformat()}.")


if __name__ == "__main__":
    main()
