package api

import kotlinx.serialization.Serializable

@Serializable
data class CategoryDto(
    val id: Int,
    val name: String
)

@Serializable
data class CategoryCreateDto(
    val name: String
)

@Serializable
data class PersonDto(
    val id: Int,
    val name: String
)

@Serializable
data class SubcategoryDto(
    val id: Int,
    val name: String,
    val categoryId: Int
)

@Serializable
data class SubcategoryCreateDto(
    val name: String,
    val categoryId: Int
)

@Serializable
data class DictionariesDto(
    val categories: List<CategoryDto>,
    val subcategories: List<SubcategoryDto>,
    val persons: List<PersonDto>
)

