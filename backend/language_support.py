"""Target language support for oral-practice missions."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SupportedLanguage:
    code: str
    label: str
    recommended_voice: str
    guide_language: str


SUPPORTED_LANGUAGES: list[SupportedLanguage] = [
    SupportedLanguage("en-US", "English (US)", "tiffany", "english"),
    SupportedLanguage("en-GB", "English (UK)", "tiffany", "english"),
    SupportedLanguage("en-AU", "English (Australia)", "tiffany", "english"),
    SupportedLanguage("en-IN", "English / Hindi (India)", "tiffany", "hindi"),
    SupportedLanguage("fr-FR", "French", "tiffany", "french"),
    SupportedLanguage("it-IT", "Italian", "tiffany", "italian"),
    SupportedLanguage("de-DE", "German", "tiffany", "german"),
    SupportedLanguage("es-US", "Spanish (US)", "tiffany", "spanish"),
    SupportedLanguage("pt-BR", "Portuguese (Brazil)", "tiffany", "portuguese"),
    SupportedLanguage("hi-IN", "Hindi", "tiffany", "hindi"),
]


MISSION_SAMPLE_ANSWERS: dict[str, dict[str, str]] = {
    "english": {
        "intro": "Hi, my name is Cyrus. I study at HKIIT in Hong Kong, and I enjoy listening to music after class.",
        "questions": "What do you like to do after school? How do you usually practice English?",
        "plan": "Let's get coffee tomorrow after class. We can practice together at the cafe.",
        "resolve": "I think we had a misunderstanding because I was nervous. Can we talk again and make a better plan together?",
    },
    "french": {
        "intro": "Bonjour, je m'appelle Cyrus. J'étudie au HKIIT à Hong Kong et j'aime écouter de la musique après les cours.",
        "questions": "Qu'est-ce que tu aimes faire après les cours ? Comment est-ce que tu pratiques le français d'habitude ?",
        "plan": "On peut prendre un café demain après les cours. Nous pouvons pratiquer ensemble au café.",
        "resolve": "Je pense qu'il y a eu un malentendu parce que j'étais nerveux. Est-ce qu'on peut en reparler et faire un meilleur plan ensemble ?",
    },
    "italian": {
        "intro": "Ciao, mi chiamo Cyrus. Studio allo HKIIT di Hong Kong e mi piace ascoltare musica dopo le lezioni.",
        "questions": "Che cosa ti piace fare dopo le lezioni? Come pratichi di solito l'italiano?",
        "plan": "Possiamo prendere un caffè domani dopo le lezioni. Possiamo esercitarci insieme al bar.",
        "resolve": "Penso che ci sia stato un malinteso perché ero nervoso. Possiamo parlarne di nuovo e fare un piano migliore insieme?",
    },
    "german": {
        "intro": "Hallo, ich heiße Cyrus. Ich lerne am HKIIT in Hongkong und höre nach dem Unterricht gern Musik.",
        "questions": "Was machst du gern nach dem Unterricht? Wie übst du normalerweise Deutsch?",
        "plan": "Lass uns morgen nach dem Unterricht Kaffee trinken. Wir können zusammen im Café üben.",
        "resolve": "Ich glaube, es gab ein Missverständnis, weil ich nervös war. Können wir noch einmal darüber sprechen und zusammen einen besseren Plan machen?",
    },
    "spanish": {
        "intro": "Hola, me llamo Cyrus. Estudio en HKIIT en Hong Kong y me gusta escuchar música después de clase.",
        "questions": "¿Qué te gusta hacer después de clase? ¿Cómo practicas el español normalmente?",
        "plan": "Vamos a tomar café mañana después de clase. Podemos practicar juntos en la cafetería.",
        "resolve": "Creo que hubo un malentendido porque estaba nervioso. ¿Podemos hablar otra vez y hacer un mejor plan juntos?",
    },
    "portuguese": {
        "intro": "Olá, meu nome é Cyrus. Eu estudo no HKIIT em Hong Kong e gosto de ouvir música depois da aula.",
        "questions": "O que você gosta de fazer depois da aula? Como você pratica português normalmente?",
        "plan": "Vamos tomar café amanhã depois da aula. Podemos praticar juntos no café.",
        "resolve": "Eu acho que houve um mal-entendido porque eu estava nervoso. Podemos conversar de novo e fazer um plano melhor juntos?",
    },
    "hindi": {
        "intro": "नमस्ते, मेरा नाम साइरस है। मैं हांगकांग के HKIIT में पढ़ता हूँ और कक्षा के बाद संगीत सुनना पसंद करता हूँ।",
        "questions": "कक्षा के बाद तुम्हें क्या करना पसंद है? तुम आम तौर पर हिंदी का अभ्यास कैसे करते हो?",
        "plan": "चलो कल कक्षा के बाद कॉफी पीते हैं। हम कैफ़े में साथ में अभ्यास कर सकते हैं।",
        "resolve": "मुझे लगता है कि गलतफ़हमी हो गई क्योंकि मैं घबराया हुआ था। क्या हम फिर से बात कर सकते हैं और साथ में बेहतर योजना बना सकते हैं?",
    },
}


def get_language(code: str | None) -> SupportedLanguage:
    if code:
        for language in SUPPORTED_LANGUAGES:
            if language.code == code:
                return language
    return SUPPORTED_LANGUAGES[0]


def get_supported_languages_payload() -> list[dict]:
    return [
        {
            "code": language.code,
            "label": language.label,
            "recommendedVoice": language.recommended_voice,
        }
        for language in SUPPORTED_LANGUAGES
    ]


def get_localized_sample_answer(*, mission_id: str, language_code: str) -> str:
    language = get_language(language_code)
    samples = MISSION_SAMPLE_ANSWERS.get(language.guide_language) or MISSION_SAMPLE_ANSWERS["english"]
    return samples.get(mission_id, MISSION_SAMPLE_ANSWERS["english"].get(mission_id, ""))
